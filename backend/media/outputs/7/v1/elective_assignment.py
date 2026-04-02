# Parallel Computing Calculator

def calculate_flops():
    print("\n--- FLOPS Calculator ---")
    operations = float(input("Enter number of floating point operations: "))
    time = float(input("Enter execution time in seconds: "))

    flops = operations / time
    print(f"FLOPS = {flops:.2f} operations per second\n")


def calculate_speedup_efficiency():
    print("\n--- Speedup and Efficiency Calculator ---")
    serial_time = float(input("Enter serial execution time: "))
    parallel_time = float(input("Enter parallel execution time: "))
    processors = int(input("Enter number of processors: "))

    speedup = serial_time / parallel_time
    efficiency = speedup / processors

    print(f"Speedup = {speedup:.2f}")
    print(f"Efficiency = {efficiency:.2f}\n")


def amdahl_single():
    print("\n--- Amdahl's Law (Single Improved Part) ---")
    p = float(input("Enter fraction of program that can be improved (e.g. 0.4): "))
    s = float(input("Enter speedup of improved part: "))

    speedup = 1 / ((1 - p) + (p / s))
    print(f"Overall Speedup = {speedup:.2f}\n")


def amdahl_multiple():
    print("\n--- Amdahl's Law (Multiple Parts) ---")
    parts = int(input("Enter number of program parts: "))

    total = 0
    for i in range(parts):
        p = float(input(f"Enter fraction of execution time for Part {i+1}: "))
        s = float(input(f"Enter speedup for Part {i+1}: "))
        total += p / s

    speedup = 1 / total
    print(f"Overall Speedup = {speedup:.2f}\n")


def amdahl_menu():
    print("\nAmdahl's Law Options")
    print("1. Single improved part")
    print("2. Multiple program parts")

    choice = input("Enter choice: ")

    if choice == "1":
        amdahl_single()
    elif choice == "2":
        amdahl_multiple()
    else:
        print("Invalid choice\n")


def main():
    while True:
        print("===== Parallel Computing Menu =====")
        print("1. Calculate FLOPS")
        print("2. Calculate Speedup and Efficiency")
        print("3. Calculate Overall Speedup (Amdahl's Law)")
        print("4. Exit")

        choice = input("Enter your choice: ")

        if choice == "1":
            calculate_flops()

        elif choice == "2":
            calculate_speedup_efficiency()

        elif choice == "3":
            amdahl_menu()

        elif choice == "4":
            print("Program terminated.")
            break

        else:
            print("Invalid choice. Try again.\n")


main()