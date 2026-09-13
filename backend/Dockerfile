FROM python:3.12-slim AS backend-base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        default-jdk-headless \
        nodejs \
        php-cli \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip \
    && pip install -r requirements.txt

COPY . .
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["sh", "-c", "gunicorn config.wsgi:application --bind 0.0.0.0:${PORT:-8080} --workers ${WEB_CONCURRENCY:-3} --timeout 120"]

# Only the trusted hosting worker needs the Docker client/socket.
FROM backend-base AS hosting-worker
COPY --from=docker:29-cli /usr/local/bin/docker /usr/local/bin/docker
ENTRYPOINT ["python", "manage.py"]
CMD ["hosting_worker"]

FROM backend-base AS web
