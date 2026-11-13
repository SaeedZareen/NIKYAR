from core.jobs.registry import Daily, task
from core.kernel.validators import fa_digits


@task("hr.probation", "یادآوری ارزیابی دوره‌ی آزمایشی", schedule=Daily(lambda: "07:30"))
def remind_probation() -> str:
    from .onboarding import remind_probation as run

    return f"برای {fa_digits(run())} کارمند یادآوری فرستاده شد."
