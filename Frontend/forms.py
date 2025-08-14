from flask_wtf import FlaskForm
from wtforms import StringField, TextAreaField, DateField, URLField, SubmitField
from wtforms.validators import DataRequired, URL, Optional

class ConferenceForm(FlaskForm):
    conference_id = StringField("Conference ID", validators=[DataRequired()])
    conference_name = StringField("Conference Name", validators=[DataRequired()])
    country = StringField("Country", validators=[Optional()])
    city = StringField("City", validators=[Optional()])
    deadline = DateField("Submission Deadline", validators=[Optional()])
    start_date = DateField("Start Date", validators=[DataRequired()])
    end_date = DateField("End Date", validators=[DataRequired()])
    topic_list = TextAreaField("Conference Topics/Description", validators=[DataRequired()])
    conference_link = URLField("Conference URL", validators=[DataRequired(), URL()])
    submit = SubmitField("Enter")