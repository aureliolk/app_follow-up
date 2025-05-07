import { schedules } from "@trigger.dev/sdk/v3";

export const secondScheduledTask = schedules.task({
  id: "second-scheduled-task",
  cron: {
    //5am every day Tokyo time
    pattern: "1 * * * *",
    timezone: "America/Sao_Paulo",
  },
  run: async (payload) => {
    console.log("secondScheduledTask");
  },
});