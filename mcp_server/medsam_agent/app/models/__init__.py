"""Model adapter registry and loader.

Adapters are imported lazily so lightweight backends such as ``mock`` can run
without importing torch or MedSAM dependencies at MCP server startup.
"""

from typing import TYPE_CHECKING

from .base_adapter import BaseSegAdapter, Prompt, SegResult

if TYPE_CHECKING:
    from .medsam_adapter import MedSAMAdapter
    from .medsam2_adapter import MedSAM2Adapter
    from .mock_adapter import MockAdapter
    from .sam_adapter import SAMAdapter


def load_adapter(backend: str, **kwargs) -> BaseSegAdapter:
    """Factory: create and return the correct adapter.

    Parameters
    ----------
    backend:
        "medsam" | "medsam2" | "sam" | "mock"
    **kwargs:
        Passed to the adapter constructor (checkpoint, device, etc.)
    """
    backend = backend.lower()
    if backend == "medsam":
        from .medsam_adapter import MedSAMAdapter

        return MedSAMAdapter(**kwargs)
    elif backend == "medsam2":
        from .medsam2_adapter import MedSAM2Adapter

        return MedSAM2Adapter(**kwargs)
    elif backend == "sam":
        from .sam_adapter import SAMAdapter

        return SAMAdapter(**kwargs)
    elif backend == "mock":
        from .mock_adapter import MockAdapter

        return MockAdapter(**kwargs)
    else:
        raise ValueError(
            f"Unknown backend {backend!r}. Choose from: medsam, medsam2, sam, mock"
        )


__all__ = [
    "BaseSegAdapter",
    "Prompt",
    "SegResult",
    "load_adapter",
]
