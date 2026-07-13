FROM golang:1.22-alpine AS builder

RUN apk add --no-cache gcc musl-dev sqlite-dev

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=1 GOOS=linux go build -o main main.go

FROM alpine:3.20

RUN apk add --no-cache sqlite-libs docker-cli

WORKDIR /app

COPY --from=builder /app/main ./main

ENV PORT=3001
EXPOSE 3001

CMD ["./main"]
