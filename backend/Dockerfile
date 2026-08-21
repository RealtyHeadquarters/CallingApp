# ProCallingApp backend API — self-host image.
FROM node:20-alpine

WORKDIR /app

# openssl: required by Prisma engines. postgresql-client: handy for migrations/debug.
RUN apk add --no-cache openssl postgresql-client

# Install deps (incl. prisma CLI, needed for `prisma db push` at boot).
COPY package*.json ./
RUN npm ci || npm install

# Generate the Prisma client against the schema.
COPY prisma ./prisma
RUN npx prisma generate

# App source.
COPY . .

EXPOSE 4000

# On boot: sync the schema (idempotent — no-op if already in sync), seed the plan
# catalog (idempotent), then start the API.
CMD ["sh", "-c", "npx prisma db push --skip-generate && node prisma/seed-plans.mjs || true; node src/server.js"]
