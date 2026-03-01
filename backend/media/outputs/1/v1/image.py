import cv2 as cv

img = cv.imread('Photos/basic.webp')
cv.imshow('image',img)
cv.waitKey(20)