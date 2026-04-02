
orders = [
    {"id": 1, "customer": "alice", "total": 250},
    {"id": 2, "customer": "Bob", "total": 120},
    {"id": 3, "customer": "Daisy", "total": 80},
    {"id": 4, "customer": "charlie", "total": 300},
    {"id": 5, "customer": "daisy", "total": 90}
]

def list_orders(orders):
    for order in orders:
        yield order

def expensive_orders(order_gen):
    for order in order_gen:
        if order["total"] >= 200:
            yield order
        
def apply_discount(order_gen):
    for order in order_gen:
        discounted = order.copy()
        discounted["total"] *= 0.9
        yield discounted

step1 = list_orders(orders)
step2 = expensive_orders(step1)
step3 = apply_discount(step2)

for order in step3:
    print('final orders: ', order)


        