from typing import TypedDict, Union


class User(TypedDict):
    name: str
    age: int
    email: str


def get_user_input() -> User:
    name: str = input("Enter your name: ").strip()

    while True:
        try:
            age: int = int(input("Enter your age: "))
            if age < 0:
                raise ValueError("Age cannot be negative.")
            break
        except ValueError:
            print("Invalid age. Please enter a valid number.")
 
    email: str = input("Enter your email: ").strip()

    return {
        "name": name,
        "age": age,
        "email": email
    }


def process_user(data: User) -> str:
    status: str = "adult" if data["age"] > 18 else "minor"
    return f"{data['name']} is {status}"


def calculate_discount(price: Union[int, float], discount: float) -> float:
    if not isinstance(price, (int, float)):
        raise TypeError("Price must be a number (int or float).")

    if not isinstance(discount, (int, float)):
        raise TypeError("Discount must be a number.")

    if not 0 <= discount <= 1:
        raise ValueError("Discount must be between 0 and 1 (e.g., 0.20 for 20%).")

    return float(price - (price * discount))


def send_email(user: User, message: str) -> None:
    print(f"\nSending email to {user['email']}")
    print(f"Message: {message}")

user_data: User = get_user_input()

print(process_user(user_data))

while True:
    try:
        price: float = float(input("Enter product price: "))
        break
    except ValueError:
        print("Invalid price. Please enter a number.")

while True:
    try:
        discount: float = float(input("Enter discount (0-1 format, e.g., 0.20): "))
        final_price = calculate_discount(price, discount)
        break
    except (ValueError, TypeError) as e:
        print("Error:", e)

print(f"Final price after discount: {final_price}")

send_email(user_data, "Your purchase was successful!")