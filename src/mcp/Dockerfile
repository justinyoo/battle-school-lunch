FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml .
COPY school_lunch_mcp ./school_lunch_mcp
RUN pip install --no-cache-dir .
EXPOSE 8001
CMD ["python", "-m", "school_lunch_mcp.server"]
