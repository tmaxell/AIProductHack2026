# syntax=docker/dockerfile:1

# Шага сборки нет намеренно: фронтенд пока статический HTML/CSS/JS.
# Когда появится бандлер, сюда добавляется stage build и копируется его dist.
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY public /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=3s --retries=5 \
  CMD wget --quiet --spider http://127.0.0.1/ || exit 1
