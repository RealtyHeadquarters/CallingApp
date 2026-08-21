# ProCallingApp web CRM — build the React app, serve it with nginx which also
# reverse-proxies /api to the backend (same origin → no CORS headaches).
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci || npm install
COPY . .
# Same-origin API path — nginx proxies /api to the backend container.
ENV VITE_API_BASE=/api
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
