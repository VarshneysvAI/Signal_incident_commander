.PHONY: dev test lint clean

dev:
	cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

test:
	cd backend && pytest -q

lint:
	cd backend && flake8 app tests

clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type d -name .pytest_cache -exec rm -rf {} +
	find . -type d -name node_modules -exec rm -rf {} +
	rm -f backend/signal.db
	rm -f frontend/dist/*

install-backend:
	cd backend && pip install -r requirements.txt

install-frontend:
	cd frontend && npm install

build-frontend:
	cd frontend && npm run build

smoke:
	./scripts/smoke.sh
