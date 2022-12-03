run-debug:
	flask --debug run
run-demo:
	gunicorn3 -e SCRIPT_NAME=/hackaday/mmo --bind 0.0.0.0:8030 app:app
