import enum


class ReportStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    EXPIRED = "EXPIRED"
    FLAGGED = "FLAGGED"
