# Desktop Action Rules

When the user asks to trigger or play a recorded macro/action or start an application via macro actions (such as starting Unity via the "unity" macro or playing "meine_aktion"), the agent MUST use the `run_command` tool to execute it.

## Execution Command
To run an action named `<action_name>`, execute the following command in the directory `C:\Users\Chris\OneDrive\Dokumente\Way`:
```powershell
.\action play <action_name>
```
Specify the working directory (`Cwd`) as `C:\Users\Chris\OneDrive\Dokumente\Way` when running the command.

Do NOT try to write custom scripts or emulate the macro yourself. Always delegate to the `action` CLI player tool in that specific directory.
