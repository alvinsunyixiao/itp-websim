from flask import Flask

app = Flask(__name__)

@app.route('/debugdict')
def get_debug_dict():
    return {'data1': 'abcd', 'data2': 'abcd'}
