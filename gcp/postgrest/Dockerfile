# PostgREST on Cloud Run. Renders config from env at startup, binds to $PORT.
FROM postgrest/postgrest:v12.2.3

USER root
# (image already contains the postgrest binary at /bin/postgrest)
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
