# Multi-stage Dockerfile for Renovate Playground
# Stage 1: Build stage using RHEL UBI with Node.js 22
FROM registry.access.redhat.com/ubi9/nodejs-22:latest AS builder

# Set working directory
WORKDIR /app

# Disable Nx daemon for Docker builds
ENV NX_DAEMON=false

# Install pnpm globally
USER root
RUN npm install -g pnpm@latest

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml ./
COPY nx.json tsconfig.base.json jest.config.ts jest.preset.js ./

# Copy project configuration files
COPY apps/api/project.json apps/api/
COPY apps/ui/project.json apps/ui/
COPY apps/api/tsconfig.app.json apps/api/
COPY apps/ui/tsconfig.app.json apps/ui/

# Install dependencies using pnpm
RUN pnpm install --frozen-lockfile

# Copy source code
COPY apps/ apps/
COPY .eslintrc.json ./

# Build both UI and API applications
RUN pnpm nx build ui --configuration=production
RUN pnpm nx build api --configuration=production

# Stage 2: Production runtime stage
FROM registry.access.redhat.com/ubi9/nodejs-22-minimal:latest AS runtime

# Set working directory
WORKDIR /app

# Create non-root user for security
USER root
# Install git and pnpm for production dependencies
RUN microdnf install -y git && microdnf clean all
RUN npm install -g pnpm@latest

# Copy package files and install only production dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile && pnpm store prune

# Copy built applications from builder stage
COPY --from=builder /app/dist/apps/api ./dist/apps/api
COPY --from=builder /app/dist/apps/ui ./dist/apps/ui



# Switch to non-root user
USER 1001

# Expose port
EXPOSE 8080

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/api/health || exit 1

# Start the application
CMD ["node", "dist/apps/api/src/main.js"]
