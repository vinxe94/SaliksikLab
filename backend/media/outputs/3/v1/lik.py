from abc import ABC, abstractmethod

class Payment(ABC):

    @abstractmethod
    def pay(self,amount:float)->str:
        pass
    @abstractmethod
    def refund(self,amount:float)->str:
        pass

class CreditCardPayment(Payment):

    def __init__(self, card_number: str):
        self.card_number = card_number
  
  
    def pay(self, card_numbe: str):
        self.card_number = card_number

    def refund(self,amount: float)->str:
        return f"Refunded{amount:.2f} to credit card ending in {self.card_number[-4:]}"
        
class GcashPayment(Payment):

    def __init__(self, phone_number: str):

