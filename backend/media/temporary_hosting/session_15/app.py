from flask import Flask
app = Flask(__name__)

@app.route("/")
def home():
    return """<!doctype html>
<html><head><title>Python Website</title></head>
<body style='font-family:Arial;text-align:center;padding:60px'>
<h1>🐍 Python + Flask</h1>
<p>This temporary website is running successfully.</p>
</body></html>"""

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
