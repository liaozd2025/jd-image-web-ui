from __future__ import annotations

from dataclasses import dataclass
from math import ceil

from fastapi import Request


@dataclass(frozen=True)
class PageRequest:
    page: int
    page_size: int

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


def parse_page_request(
    request: Request,
    *,
    default_page_size: int = 20,
    maximum_page_size: int = 100,
) -> PageRequest | None:
    try:
        page = int(request.query_params.get("page", "1"))
        raw_page_size = request.query_params.get("page_size")
        if raw_page_size is None and request.query_params.get("limit") is not None:
            raw_page_size = request.query_params.get("limit")
        page_size = int(raw_page_size or default_page_size)
    except (TypeError, ValueError):
        return None
    if page < 1 or page_size < 1 or page_size > maximum_page_size:
        return None
    return PageRequest(page=page, page_size=page_size)


def pagination_payload(page: PageRequest, total_items: int) -> dict[str, int]:
    total = max(0, int(total_items))
    return {
        "page": page.page,
        "page_size": page.page_size,
        "total_items": total,
        "total_pages": ceil(total / page.page_size) if total else 0,
    }
