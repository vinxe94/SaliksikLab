FROM python:3.12-slim-bookworm

# Trusted Python runtime, including native mysqlclient build dependencies.
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc pkg-config default-libmysqlclient-dev \
    && rm -rf /var/lib/apt/lists/*
