# 手册 5.5；官方 1.0 helper 镜像与 npm SDK 保持同一版本。
# https://developers.cloudflare.com/sandbox/reference/#requirements
FROM docker.io/cloudflare/sandbox:1.0.3 AS acloud-sandbox-base
FROM python:3.13-slim
COPY --from=acloud-sandbox-base /usr/local/bin/sandbox-shim /usr/local/bin/sandbox-shim
RUN pip install --no-cache-dir pandas==2.3.3
COPY analyze.py /opt/acloud/analyze.py
RUN mkdir -p /workspace
CMD ["sleep", "infinity"]
