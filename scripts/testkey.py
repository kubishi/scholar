from openai import OpenAI
import dotenv
import os

dotenv.load_dotenv()

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

def test_openai_api_key():

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "What is the capital of France?"}
        ]
    )
    print(response.choices[0].message.content)

if __name__ == "__main__":
    test_openai_api_key()