# Build stage for frontend
FROM node:18-alpine AS frontend-builder
WORKDIR /app
COPY package.json yarn.lock ./
# Prevent prepare script from running during install by replacing it with a no-op
RUN sed -i 's|./build.mjs|true|' package.json
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build

# Build stage for backend
FROM golang:1.21-alpine AS backend-builder
WORKDIR /app
COPY go.mod ./
# No go.sum usually means no external deps, but running tidy is safe
# RUN go mod download 
COPY . .
# Copy built frontend assets to the expected location for embedding
COPY --from=frontend-builder /app/public/dist ./public/dist
# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/bin/dsadmin ./cmd/dsadmin

# Final stage
FROM alpine:3.18
WORKDIR /app
COPY --from=backend-builder /app/bin/dsadmin .

# Environment variables
ENV PORT=8080
ENV DATASTORE_PROJECT_ID=""
ENV DATASTORE_EMULATOR_HOST="localhost:8081"

EXPOSE 8080

CMD ["./dsadmin"]
