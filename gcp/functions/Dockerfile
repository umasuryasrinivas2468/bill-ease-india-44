# One image for all Deno edge functions. The function to run is selected at
# runtime via FUNCTION_NAME. Each function calls serve()/Deno.serve() which
# listens on port 8000 (Cloud Run is configured with --port=8000).
#
# Build context = repo root (so supabase/functions/* is included):
#   gcloud builds submit --config gcp/functions/cloudbuild.yaml .
FROM denoland/deno:1.45.5

WORKDIR /app
COPY supabase/functions ./functions
COPY gcp/functions/entrypoint.sh /entrypoint.sh

USER root
RUN chmod +x /entrypoint.sh

# Pre-cache dependencies for every function to speed cold starts.
RUN for d in ./functions/*/; do \
      if [ -f "$d/index.ts" ]; then deno cache "$d/index.ts" || true; fi; \
    done

ENV PORT=8000
ENTRYPOINT ["/entrypoint.sh"]
