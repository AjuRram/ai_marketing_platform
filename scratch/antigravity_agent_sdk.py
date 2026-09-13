"""
Google Antigravity Python SDK Implementation Example

This script demonstrates how to programmatically lease, configure,
and run an AI agent using the Google Antigravity Python SDK.
"""

import asyncio
import os
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

try:
    from google.antigravity import Agent, LocalAgentConfig, CapabilitiesConfig
    HAS_SDK = True
except ImportError:
    HAS_SDK = False


async def run_antigravity_agent(prompt: str):
    if not HAS_SDK:
        print("Google Antigravity SDK is not installed yet.")
        print("Install via: pip install google-antigravity")
        return

    print(f"[Antigravity Agent] Initializing session for prompt: '{prompt}'...")

    import os
    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()

    config = LocalAgentConfig(
        api_key=gemini_key or None,
        model="gemini-3.6-flash",
        system_instructions="You are an autonomous AI software engineer and marketing agent.",
        capabilities=CapabilitiesConfig(),  # Enables write & execution tools
    )

    if not gemini_key:
        print("[Notice] GEMINI_API_KEY is not set. Set export GEMINI_API_KEY='your_key' to run live queries.")
        return

    async with Agent(config) as agent:
        response = await agent.chat(prompt)

        print("\n--- [Agent Response Stream] ---")
        async for token in response:
            sys.stdout.write(token)
            sys.stdout.flush()
        print("\n-------------------------------\n")


if __name__ == "__main__":
    test_prompt = "Summarize the core capabilities of the Pulse Agentic Marketing Platform."
    asyncio.run(run_antigravity_agent(test_prompt))
