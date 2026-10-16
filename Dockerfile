FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 AIROOM_DATA=/data AIROOM_HOST=0.0.0.0
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && useradd --create-home --uid 10001 airoom && mkdir /data && chown airoom:airoom /data
COPY --chown=airoom:airoom server.py llm.py setup.py ./
COPY --chown=airoom:airoom static ./static
USER airoom
EXPOSE 18888
CMD ["sh", "-c", "python setup.py && exec python server.py"]
