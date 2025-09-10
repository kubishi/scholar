from .services.db_services import db

class User(db.Model):
    google_auth_id = db.Column(db.String(60), primary_key=True)
    user_name = db.Column(db.String(50))
    user_email = db.Column(db.String(50))

class Favorite_Conf(db.Model):
    user_id = db.Column(db.String(60), db.ForeignKey('user.google_auth_id'), primary_key=True)
    fav_conf_id = db.Column(db.String(50), primary_key=True)
