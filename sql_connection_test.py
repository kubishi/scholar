from flask import Flask, redirect, render_template, session, url_for, request
from datetime import datetime

from flask_sqlalchemy import SQLAlchemy


app = Flask(__name__)

app.config['SQLALCHEMY_DATABASE_URI'] = 'mysql+pymysql://myapp_user:Sebastian1@localhost/myapp_db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50))
    email = db.Column(db.String(100), unique=True)
    date_joined = db.Column(db.DateTime, default=datetime.utcnow)


if __name__ == '__main__':
    with app.app_context():
        # ✅ Create the tables
        db.create_all()

        # ✅ Add a test user
        new_user = User(name='Ulrich', email='stinky.com')
        db.session.add(new_user)
        db.session.commit()

        print('✅ User added!')