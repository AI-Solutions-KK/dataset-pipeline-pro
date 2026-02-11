# ---------- BASE ----------
FROM node:20-bullseye

# ---------- SYSTEM DEPS ----------
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    poppler-utils \
    tesseract-ocr \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

# ---------- WORKDIR ----------
WORKDIR /app

# ---------- COPY PROJECT ----------
COPY . .

# ---------- PYTHON DEPS ----------
RUN pip3 install --no-cache-dir -r server/python_src/requirements.txt

# ---------- CLIENT BUILD ----------
WORKDIR /app/client
RUN npm install
RUN npm run build

# ---------- SERVER SETUP ----------
WORKDIR /app/server
RUN npm install

# ---------- SERVE FRONTEND ----------
# copy built client into server public folder
RUN mkdir -p public
RUN cp -r /app/client/dist/* public/

# ---------- HF PORT ----------
ENV PORT=7860
EXPOSE 7860

# ---------- START ----------
CMD ["node", "server.js"]
