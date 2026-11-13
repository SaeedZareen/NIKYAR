from core.jobs.registry import Daily, task
from core.kernel.validators import fa_digits


@task("hr.probation", "یادآوری ارزیابی دوره‌ی آزمایشی", schedule=Daily(lambda: "07:30"))
def remind_probation() -> str:
    from .onboarding import remind_probation as run

    return f"برای {fa_digits(run())} کارمند یادآوری فرستاده شد."


@task("hr.contracts", "یادآوری پایان قرارداد کارکنان", schedule=Daily(lambda: "07:40"))
def remind_contracts() -> str:
    from .contracts import remind_contracts as run

    return f"برای {fa_digits(run())} قرارداد یادآوری فرستاده شد."
