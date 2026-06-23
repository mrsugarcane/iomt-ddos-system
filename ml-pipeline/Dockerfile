FROM python:3.12-slim
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY src ./src
RUN mkdir -p data results

WORKDIR /app/src
ENTRYPOINT ["python", "run_pipeline.py"]
