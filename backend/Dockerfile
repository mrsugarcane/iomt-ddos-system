FROM node:22-alpine AS base
WORKDIR /app

# Install production dependencies only
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Copy application code
COPY server.js ./
COPY src ./src
COPY data ./data

# Create a non-root user and writable dirs it needs
RUN addgroup -S sentinel && adduser -S sentinel -G sentinel \
    && mkdir -p /app/logs /app/data \
    && chown -R sentinel:sentinel /app

USER sentinel

ENV NODE_ENV=production
ENV PORT=4000
ENV DB_PATH=/app/db_data/sentinel.db

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
