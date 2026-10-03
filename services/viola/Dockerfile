# Viola – ein Abbild für beide Rollen:
#   Textmodus (HTTP):  docker run … fermata-viola text-server
#   Stimme (LiveKit):  docker run … fermata-viola voice-worker start
# Läuft als eigener Benutzer ohne Rechte, schreibt nichts auf die Platte (Root-Dateisystem kann schreibgeschützt sein).

# Optional (nur hinter TLS-prüfenden Firmen-Proxys): zusätzliches CA-Zertifikat als Build-Secret „ca“,
#   docker build --secret id=ca,src=/pfad/ca.crt …  – landet nicht im Abbild.
FROM python:3.12-slim AS build
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never PIP_DISABLE_PIP_VERSION_CHECK=1
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export PIP_CERT=/run/secrets/ca SSL_CERT_FILE=/run/secrets/ca; fi; \
    pip install --no-cache-dir uv==0.8.17
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export SSL_CERT_FILE=/run/secrets/ca; fi; \
    uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export SSL_CERT_FILE=/run/secrets/ca; fi; \
    uv sync --frozen --no-dev --no-editable

FROM python:3.12-slim
RUN groupadd --system --gid 10001 viola \
 && useradd --system --uid 10001 --gid viola --home-dir /app --shell /usr/sbin/nologin viola
WORKDIR /app
COPY --from=build --chown=root:root /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HOME=/tmp \
    VIOLA_ENV=production \
    VIOLA_TEXT_PORT=8352
USER 10001:10001
# 8352: Textmodus (HTTP), 8081: Gesundheitsprüfung des LiveKit-Workers
EXPOSE 8352 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import os,sys,urllib.request as u; p=os.environ.get('VIOLA_HEALTH_PORT','8352'); q=os.environ.get('VIOLA_HEALTH_PATH','/healthz'); sys.exit(0 if u.urlopen(f'http://127.0.0.1:{p}{q}', timeout=4).status < 500 else 1)" || exit 1
ENTRYPOINT ["viola"]
CMD ["text-server"]
