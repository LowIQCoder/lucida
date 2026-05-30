# Lucida

![Lucida enhancer preview](assets/enhancer.png)

Lucida is a small project for client-side image correction. A CNN checkpoint predicts brightness, contrast, and saturation values from an input image; the browser runs the ONNX model with ONNX Runtime Web and applies the correction locally with Canvas.

Images are not uploaded for inference. The backend only serves the latest model checkpoint and its config.

## Structure

- `frontend/` - static browser app, image UI, preprocessing, ONNX Runtime Web inference.
- `backend/` - FastAPI service for health checks and checkpoint delivery.
- `ml/` - dataset code, model definition, training script, ONNX export.

## Deploy

Create `.env` from `.env.example`, then run:

```bash
docker compose up --build
```

Default services:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`

Useful backend endpoints:

- `GET /api/health`
- `GET /api/checkpoint/latest`
- `GET /api/checkpoint/<model_id>`

The frontend container proxies `/api/*` to the backend using `BACKEND_URL` from `.env`.

## Dataset

Dataset starts from original images and adds synthetic corruption with different severity levels.

| Small corruption | Medium corruption | High corruption |
| --- | --- | --- |
| ![Small corruption example](assets/demo-corrupted1.jpg) | ![Medium corruption example](assets/demo-corrupted2.jpg) | ![High corruption example](assets/demo-corrupted3.jpg) |

## Model

This project uses simple CNN

```mermaid
flowchart LR
    image["HSV image<br/>B x 3 x 256 x 256"]
    stats["stats<br/>B x 18"]
    norm["normalize<br/>(image - 0.5) / 0.5"]

    image --> norm

    subgraph encoder["CNN encoder"]
        direction LR
        l1["Level 1<br/>Conv 3x3 stride 2: HSV 3 to 32<br/>BatchNorm + ReLU<br/>ResidualConvBlock 32<br/>B x 32 x 128 x 128"]
        l2["Level 2<br/>Conv 3x3 stride 2: 32 to 64<br/>BatchNorm + ReLU<br/>ResidualConvBlock 64<br/>add proj r1<br/>B x 64 x 64 x 64"]
        l3["Level 3<br/>Conv 3x3 stride 2: 64 to 128<br/>BatchNorm + ReLU<br/>ResidualConvBlock 128<br/>add proj r1 and r2<br/>B x 128 x 32 x 32"]
        l4["Level 4<br/>Conv 3x3 stride 2: 128 to 192<br/>BatchNorm + ReLU<br/>ResidualConvBlock 192<br/>add proj r1 r2 r3<br/>B x 192 x 16 x 16"]
        l5["Level 5<br/>Conv 3x3 stride 2: 192 to 256<br/>BatchNorm + ReLU<br/>ResidualConvBlock 256<br/>add proj r1 r2 r3 r4<br/>B x 256 x 8 x 8"]
    end

    norm --> l1 --> l2 --> l3 --> l4 --> l5

    p1["pool L1<br/>Linear 32 to 32<br/>r1"]
    p2["pool L2<br/>Linear 64 to 32<br/>r2"]
    p3["pool L3<br/>Linear 128 to 32<br/>r3"]
    p4["pool L4<br/>Linear 192 to 32<br/>r4"]
    p5["pool L5<br/>Linear 256 to 32<br/>r5"]

    l1 --> p1
    l2 --> p2
    l3 --> p3
    l4 --> p4
    l5 --> p5

    p1 -.-> l2
    p1 -.-> l3
    p1 -.-> l4
    p1 -.-> l5
    p2 -.-> l3
    p2 -.-> l4
    p2 -.-> l5
    p3 -.-> l4
    p3 -.-> l5
    p4 -.-> l5

    finalPool["final pool<br/>AdaptiveAvgPool2d 1<br/>flatten: B x 256"]
    concat["concat<br/>final pool B x 256<br/>stats B x 18<br/>r1..r5 B x 160<br/>total B x 434"]

    l5 --> finalPool --> concat
    stats --> concat
    p1 --> concat
    p2 --> concat
    p3 --> concat
    p4 --> concat
    p5 --> concat

    subgraph head["MLP head"]
        direction LR
        h1["Linear<br/>434 to 128"]
        h2["ReLU"]
        h3["Dropout<br/>p = 0.15"]
        h4["Linear<br/>128 to 3"]
    end

    concat --> h1 --> h2 --> h3 --> h4
    neutral["add neutral<br/>0.0 1.0 1.0"]
    output["params<br/>brightness contrast saturation"]
    h4 --> neutral --> output

    classDef inputNode fill:#d9e9ff,stroke:#3577c8,stroke-width:2px,color:#172033;
    classDef conv fill:#def4e7,stroke:#2f8f5b,stroke-width:2px,color:#172033;
    classDef residual fill:#fff0d8,stroke:#c87919,stroke-width:2px,color:#172033;
    classDef headNode fill:#eadfff,stroke:#7957c8,stroke-width:2px,color:#172033;
    classDef outputNode fill:#def4e7,stroke:#2f8f5b,stroke-width:2px,color:#172033;

    class image,stats inputNode;
    class l1,l2,l3,l4,l5 conv;
    class p1,p2,p3,p4,p5,neutral residual;
    class concat,h1,h2,h3,h4 headNode;
    class output outputNode;
```


## License

MIT License. See [LICENSE](LICENSE).
