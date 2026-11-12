from core.jobs.registry import Every, task

from . import deadlines


@task("workflow.deadlines", "یادآوری و تشدید مهلت کارهای گردش کار", schedule=Every(5))
def check_deadlines() -> str:
    return deadlines.run()
