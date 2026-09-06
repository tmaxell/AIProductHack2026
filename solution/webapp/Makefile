# Команды разработки веб-приложения. Виджет-трека (solution/src) не касаются.
SHELL := /bin/bash
COMPOSE := docker compose
COMPOSE_PROD := docker compose -f docker-compose.yml

.PHONY: help up down logs ps build prod install dev test lint typecheck security-check check clean

help: ## Показать список команд
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  %-12s %s\n", $$1, $$2}'

up: ## Поднять стек в режиме разработки (hot reload)
	$(COMPOSE) up --build

down: ## Остановить стек и удалить контейнеры
	$(COMPOSE) down --remove-orphans

logs: ## Логи всех сервисов
	$(COMPOSE) logs -f

ps: ## Состояние сервисов
	$(COMPOSE) ps

prod: ## Поднять прод-подобный стек (без bind mount и hot reload)
	$(COMPOSE_PROD) up --build

build: ## Собрать образы прод-конфигурации
	$(COMPOSE_PROD) build

install: ## Установить зависимости бекенда локально
	cd backend && npm ci

dev: ## Запустить только бекенд локально, без Docker
	cd backend && npm run dev

test: ## Тесты бекенда
	cd backend && npm test

lint: ## Линт бекенда
	cd backend && npm run lint

typecheck: ## Проверка типов бекенда
	cd backend && npm run typecheck

security-check: ## Проверить ignore секретов и tracked-файлы
	@git check-ignore -q .env
	@git check-ignore -q backend/.env
	@if git grep -Il -E 'gsk_[A-Za-z0-9_-]{16,}' -- . ':!*.example' | grep -q .; then \
		echo "Найден похожий на Groq-токен tracked-файл"; exit 1; \
	else echo "Секреты Groq в tracked-файлах не найдены"; fi

check: security-check lint typecheck test ## Все проверки подряд

clean: ## Убрать контейнеры, тома и собранные артефакты
	$(COMPOSE) down --remove-orphans --volumes
	rm -rf backend/dist
