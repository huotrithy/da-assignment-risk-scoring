# Build from the repo root:
#   docker compose up -d --build
FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1

COPY dashboard/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY dashboard/.streamlit ./.streamlit
COPY dashboard/app.py .

EXPOSE 8502
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8502/_stcore/health')"

CMD ["streamlit", "run", "app.py", "--server.port=8502", "--server.address=0.0.0.0"]
