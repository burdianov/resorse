"""SQLAlchemy models, one module per table group.

Imported for its side effects by ``migrations/env.py``: Alembic's autogenerate
only sees what has been imported, so every new model module is re-exported
here in the same commit that adds it.

The first tables arrive with F024 (users, roles, permissions and their join
tables); F023 deliberately ships the conventions and the migration machinery
without inventing a table no task owns.
"""
