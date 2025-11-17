#!/bin/bash

# Docker Management Script for Moodle Sync API
# Usage: ./docker.sh [command]

set -e

COMPOSE_FILE="docker-compose.yml"

case "${1:-help}" in
    "build")
        echo "🔨 Building Docker images..."
        docker-compose -f $COMPOSE_FILE build --no-cache
        ;;
    "up")
        echo "🚀 Starting services..."
        docker-compose -f $COMPOSE_FILE up -d
        ;;
    "down")
        echo "🛑 Stopping services..."
        docker-compose -f $COMPOSE_FILE down
        ;;
    "restart")
        echo "🔄 Restarting services..."
        docker-compose -f $COMPOSE_FILE restart
        ;;
    "logs")
        service="${2:-app}"
        echo "📋 Showing logs for $service..."
        docker-compose -f $COMPOSE_FILE logs -f $service
        ;;
    "status"|"ps")
        echo "📊 Services status:"
        docker-compose -f $COMPOSE_FILE ps
        ;;
    "shell"|"bash")
        service="${2:-app}"
        echo "🐚 Opening shell in $service container..."
        docker-compose -f $COMPOSE_FILE exec $service sh
        ;;
    "clean")
        echo "🧹 Cleaning up..."
        docker-compose -f $COMPOSE_FILE down -v --remove-orphans
        docker system prune -f
        ;;
    "update")
        echo "⬆️  Updating and rebuilding..."
        git pull
        docker-compose -f $COMPOSE_FILE build --no-cache
        docker-compose -f $COMPOSE_FILE up -d
        ;;
    "test")
        echo "🧪 Testing API endpoints..."
        echo "Waiting for services to be ready..."
        sleep 10

        # Test health endpoint
        echo "Testing health endpoint..."
        if curl -f http://localhost/api/health > /dev/null 2>&1; then
            echo "✅ Health check passed"
        else
            echo "❌ Health check failed"
            exit 1
        fi

        # Test client IP endpoint
        echo "Testing client IP endpoint..."
        if curl -f http://localhost/api/client-ip > /dev/null 2>&1; then
            echo "✅ Client IP endpoint working"
        else
            echo "❌ Client IP endpoint failed"
            exit 1
        fi

        echo "🎉 All tests passed!"
        ;;
    "help"|*)
        echo "Docker Management Script for Moodle Sync API"
        echo ""
        echo "Usage: $0 [command] [options]"
        echo ""
        echo "Commands:"
        echo "  build          Build Docker images"
        echo "  up             Start all services"
        echo "  down           Stop all services"
        echo "  restart        Restart all services"
        echo "  logs [service] Show logs (default: app)"
        echo "  status|ps      Show services status"
        echo "  shell|bash [s] Open shell in container (default: app)"
        echo "  clean          Remove containers, volumes, and prune system"
        echo "  update         Pull latest code and rebuild"
        echo "  test           Run basic API tests"
        echo "  help           Show this help message"
        echo ""
        echo "Examples:"
        echo "  $0 up                    # Start services"
        echo "  $0 logs nginx           # Show nginx logs"
        echo "  $0 shell app            # Open shell in app container"
        echo "  $0 test                  # Run API tests"
        ;;
esac