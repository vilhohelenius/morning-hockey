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
class GameResult:
    game_id: int
    away: TeamInfo
    home: TeamInfo
    final_type: str  # "REG" | "OT" | "SO"
    scorers: list[ScorerLine] = field(default_factory=list)
    goalies: list[GoalieLine] = field(default_factory=list)


@dataclass(frozen=True)
class Digest:
    date: str
    generated_at: str
    games: list[GameResult] = field(default_factory=list)
