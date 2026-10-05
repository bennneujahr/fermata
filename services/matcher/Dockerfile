# Fermata · Auswahl-Job (M4). Läuft nach Zeitplan (AWS EventBridge → ECS/Fargate, Frankfurt), siehe
# docs/bereiche/matcher.md. Zugänge kommen aus der Umgebung (IAM-Rolle für Bedrock, Secret für die Datenbank-URL).
FROM python:3.12-slim AS build
RUN pip install --no-cache-dir uv==0.8.17
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never UV_PYTHON=/usr/local/bin/python3.12
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN uv sync --frozen --no-dev --no-editable

FROM python:3.12-slim
RUN groupadd --system --gid 10001 fermata \
 && useradd --system --uid 10001 --gid fermata --home-dir /nonexistent --shell /usr/sbin/nologin fermata
WORKDIR /app
COPY --from=build --chown=root:root /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    FERMATA_MATCHER_DB_ROLE=fermata_matcher \
    FERMATA_LLM_BACKEND=bedrock \
    FERMATA_EMBEDDING_BACKEND=titan \
    FERMATA_AWS_REGION=eu-central-1
USER fermata:fermata
ENTRYPOINT ["fermata-matcher"]
CMD ["run", "--next"]
