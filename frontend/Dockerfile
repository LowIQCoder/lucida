FROM node:24-alpine AS build

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend ./

RUN mkdir -p dist \
  && cp index.html dist/index.html \
  && cp -R src dist/src


FROM nginx:alpine

COPY --from=build /app/frontend/dist /usr/share/nginx/html

ENV BACKEND_URL=http://localhost:8000

EXPOSE 80

CMD ["/bin/sh", "-c", "printf 'globalThis.__APP_CONFIG__ = { backendUrl: \"%s\" };\\n' \"$BACKEND_URL\" > /usr/share/nginx/html/runtime-config.js && nginx -g 'daemon off;'"]
