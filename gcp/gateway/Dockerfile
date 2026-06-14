# Supabase-compatible gateway (nginx) for Cloud Run.
FROM nginx:1.27-alpine

COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Cloud Run provides $PORT (default 8080). POSTGREST_UPSTREAM / STORAGE_UPSTREAM
# are injected at deploy time.
ENV PORT=8080
ENTRYPOINT ["/entrypoint.sh"]
