from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class TeamInfo:
    abbrev: str
    name: str
    logo: str
    score: int


@dataclass(frozen=True)
class ScorerLine:
    name: str
    team: str
    goals: int
    assists: int

    @property
    def points(self) -> int:
        return self.goals + self.assists

    @property
    def line(self) -> str:
        return f"{self.goals}+{self.assists}"


@dataclass(frozen=True)
class GoalieLine:
    name: str
    team: str
    decision: str | None
    saves: int
    shots_against: int
    save_pct: float | None
    toi: str


@dataclass(frozen=True)
class GoalEvent:
    period_label: str
    time_in_period: str
    team_abbrev: str
    scorer: str
    assists: list[str]
    strength: str  # "" (even strength) | "YV" | "AV"


@dataclass(frozen=True)
class TeamStatRow:
    label: str
    away_value: str
    home_value: str


@dataclass(frozen=True)
class GameBoxScore:
    goals: list[GoalEvent]
    team_stats: list[TeamStatRow]


@dataclass(frozen=True)
class GameResult:
    game_id: int
    away: TeamInfo
    home: TeamInfo
    final_type: str  # "REG" | "OT" | "SO"
    scorers: list[ScorerLine] = field(default_factory=list)
    goalies: list[GoalieLine] = field(default_factory=list)
    box_score: GameBoxScore | None = None


@dataclass(frozen=True)
class Digest:
    date: str
    generated_at: str
    games: list[GameResult] = field(default_factory=list)
