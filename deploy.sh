#!/bin/bash

# Deploy script for Claude Mobile Interface
# Usage: ./deploy.sh [production|staging|local]

set -e

ENVIRONMENT=${1:-local}
PROJECT_NAME="claude-mobile"
REGISTRY="your-registry.com"  # Update with your registry

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Deploying Claude Mobile Interface - Environment: ${ENVIRONMENT}${NC}"

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"
if ! command_exists docker; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    exit 1
fi

if ! command_exists docker-compose; then
    echo -e "${RED}Error: Docker Compose is not installed${NC}"
    exit 1
fi

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo -e "${YELLOW}Warning: .env file not found${NC}"
fi

# Build and deploy based on environment
case $ENVIRONMENT in
    production)
        echo -e "${GREEN}Building for production...${NC}"
        
        # Build Docker image
        docker build -t ${PROJECT_NAME}:latest .
        
        # Tag for registry
        docker tag ${PROJECT_NAME}:latest ${REGISTRY}/${PROJECT_NAME}:latest
        docker tag ${PROJECT_NAME}:latest ${REGISTRY}/${PROJECT_NAME}:$(date +%Y%m%d-%H%M%S)
        
        # Push to registry
        echo -e "${GREEN}Pushing to registry...${NC}"
        docker push ${REGISTRY}/${PROJECT_NAME}:latest
        
        # Deploy with docker-compose
        echo -e "${GREEN}Deploying services...${NC}"
        docker-compose -f docker-compose.yml up -d --force-recreate
        
        # Health check
        echo -e "${YELLOW}Waiting for service to be healthy...${NC}"
        sleep 5
        if curl -f http://localhost:8080/health > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Deployment successful!${NC}"
            echo -e "${GREEN}Access the app at: https://your-domain.com${NC}"
        else
            echo -e "${RED}⚠️  Health check failed${NC}"
            docker-compose logs --tail=50
        fi
        ;;
        
    staging)
        echo -e "${GREEN}Building for staging...${NC}"
        
        # Build with staging config
        docker build -t ${PROJECT_NAME}:staging .
        
        # Run locally with staging config
        docker-compose -f docker-compose.yml up -d --force-recreate
        
        echo -e "${GREEN}✅ Staging deployment complete${NC}"
        echo -e "${GREEN}Access at: http://localhost:8080${NC}"
        ;;
        
    local)
        echo -e "${GREEN}Running locally with docker-compose...${NC}"
        
        # Build and run locally
        docker-compose build
        docker-compose up -d
        
        echo -e "${GREEN}✅ Local deployment complete${NC}"
        echo -e "${GREEN}Access at: http://localhost:8080${NC}"
        echo -e "${YELLOW}Logs: docker-compose logs -f${NC}"
        ;;
        
    *)
        echo -e "${RED}Invalid environment: ${ENVIRONMENT}${NC}"
        echo "Usage: $0 [production|staging|local]"
        exit 1
        ;;
esac

# Show running containers
echo -e "\n${YELLOW}Running containers:${NC}"
docker-compose ps

# Show logs command
echo -e "\n${YELLOW}To view logs, run:${NC}"
echo "docker-compose logs -f ${PROJECT_NAME}"