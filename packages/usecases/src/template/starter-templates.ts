export type StarterTemplate = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  composeFile: string;
};

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "starter-postgres",
    name: "PostgreSQL",
    description: "A persistent PostgreSQL database with a health check.",
    tags: ["database", "postgres"],
    composeFile:
      "services:\n  postgres:\n    image: postgres:16-alpine\n    environment:\n      POSTGRES_DB: app\n      POSTGRES_USER: app\n      POSTGRES_PASSWORD: change-me\n    volumes:\n      - postgres-data:/var/lib/postgresql/data\n    healthcheck:\n      test: [CMD-SHELL, pg_isready -U app -d app]\n      interval: 10s\n      timeout: 5s\n      retries: 5\nvolumes:\n  postgres-data:\n",
  },
  {
    id: "starter-redis",
    name: "Redis",
    description: "A lightweight Redis cache with durable local storage.",
    tags: ["cache", "redis"],
    composeFile:
      "services:\n  redis:\n    image: redis:7-alpine\n    command: redis-server --appendonly yes\n    volumes:\n      - redis-data:/data\n    healthcheck:\n      test: [CMD, redis-cli, ping]\n      interval: 10s\n      timeout: 5s\n      retries: 5\nvolumes:\n  redis-data:\n",
  },
  {
    id: "starter-nginx",
    name: "Nginx",
    description: "A minimal static web server ready for a domain mapping.",
    tags: ["web", "nginx"],
    composeFile: `services:\n  web:\n    image: nginx:alpine\n    ports:\n      - "8080:80"\n    healthcheck:\n      test: [CMD, wget, --spider, --quiet, http://localhost]\n      interval: 10s\n      timeout: 5s\n      retries: 5\n`,
  },
  {
    id: "starter-minio",
    name: "MinIO",
    description: "S3-compatible object storage for local and self-hosted apps.",
    tags: ["storage", "s3", "minio"],
    composeFile: `services:\n  minio:\n    image: minio/minio:latest\n    command: server /data --console-address :9001\n    environment:\n      MINIO_ROOT_USER: minioadmin\n      MINIO_ROOT_PASSWORD: change-me-now\n    volumes:\n      - minio-data:/data\n    ports:\n      - "9000:9000"\n      - "9001:9001"\nvolumes:\n  minio-data:\n`,
  },
  {
    id: "starter-wordpress",
    name: "WordPress + MariaDB",
    description:
      "A complete WordPress starter with private database networking.",
    tags: ["cms", "wordpress", "mariadb"],
    composeFile: `services:\n  wordpress:\n    image: wordpress:6-apache\n    depends_on:\n      db:\n        condition: service_healthy\n    environment:\n      WORDPRESS_DB_HOST: db:3306\n      WORDPRESS_DB_USER: wordpress\n      WORDPRESS_DB_PASSWORD: change-me\n      WORDPRESS_DB_NAME: wordpress\n    volumes:\n      - wordpress-data:/var/www/html\n    ports:\n      - "8080:80"\n  db:\n    image: mariadb:11\n    environment:\n      MARIADB_DATABASE: wordpress\n      MARIADB_USER: wordpress\n      MARIADB_PASSWORD: change-me\n      MARIADB_RANDOM_ROOT_PASSWORD: "yes"\n    volumes:\n      - mariadb-data:/var/lib/mysql\n    healthcheck:\n      test: [CMD, healthcheck.sh, --connect, --innodb_initialized]\n      interval: 10s\n      timeout: 5s\n      retries: 10\nvolumes:\n  wordpress-data:\n  mariadb-data:\n`,
  },
];
