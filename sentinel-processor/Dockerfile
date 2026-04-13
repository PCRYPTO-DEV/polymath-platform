FROM python:3.11-slim

# Install system-level geospatial and SAR processing dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gdal-bin \
    libgdal-dev \
    libgdal32 \
    gmt \
    gmt-dcw \
    gmt-gshhg \
    snaphu \
    wget \
    curl \
    gcc \
    g++ \
    build-essential \
    libhdf5-dev \
    libnetcdf-dev \
    && rm -rf /var/lib/apt/lists/*

# Set GDAL environment for Python bindings
ENV GDAL_VERSION=3.6.4
ENV CPLUS_INCLUDE_PATH=/usr/include/gdal
ENV C_INCLUDE_PATH=/usr/include/gdal

WORKDIR /app

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir GDAL==$(gdal-config --version) && \
    pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY . .

# Create directories for processing artifacts
RUN mkdir -p /app/data/scenes /app/data/processing /app/data/results

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
