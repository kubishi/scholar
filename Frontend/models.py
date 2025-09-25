from Frontend.services.db_services import db

class User(db.Model):
    google_auth_id = db.Column(db.String(60), primary_key=True)
    user_name = db.Column(db.String(50))
    user_email = db.Column(db.String(50))

class Favorite_Conf(db.Model):
    user_id = db.Column(db.String(60), db.ForeignKey('user.google_auth_id'), primary_key=True)
    fav_conf_id = db.Column(db.String(50), primary_key=True)

class Submitted_Conferences(db.Model):
    __tablename__ = 'user_submitted_conferences'
    conf_id = db.Column(db.String(50), primary_key=True)
    submitter_user_name = db.Column(db.String(50), primary_key=True)
    submitter_id = db.Column(db.String(60), db.ForeignKey('user.google_auth_id'), primary_key=True)
    status = db.Column(
        db.Enum('waiting', 'archived', 'approved', 'submitted', name='submission_status'),
        nullable=False,
        default='waiting'
    )
    edit_type = db.Column(
        db.Enum('edit', 'new', name='submission_edit_type'),
        nullable=False,
        default='waiting'
    )
    time_approved_at = db.Column(db.DateTime, nullable=True)
    time_updated_at = db.Column(db.DateTime, nullable=True)
    time_submitted_at = db.Column(db.DateTime, nullable=True)

    conference_name = db.Column(db.String(255), nullable=False)
    country = db.Column(db.String(100), nullable=True)
    city = db.Column(db.String(100), nullable=True)
    deadline = db.Column(db.DateTime, nullable=True)
    start = db.Column(db.DateTime, nullable=True)
    end = db.Column(db.DateTime, nullable=True)
    topics = db.Column(db.Text, nullable=True)      
    url = db.Column(db.String(500), nullable=True) 