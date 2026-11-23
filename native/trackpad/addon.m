#import <AppKit/AppKit.h>
#import <objc/runtime.h>
#include <math.h>
#include <node_api.h>
#include <stdlib.h>

#ifndef TRACKPAD_BUILD
#define TRACKPAD_BUILD "unnamed"
#endif

enum { SIGNAL_DOWN = 1, SIGNAL_UP = 2, SIGNAL_MOMENTUM_BEGAN = 3, SIGNAL_MOMENTUM_ENDED = 4 };

typedef enum { HOOK_REFUSED = 0, HOOK_FRESH = 1, HOOK_TOOK_OVER = 2 } Hook;

static const char *HOOK_NAMES[] = {"refused", "fresh", "tookOver"};

typedef struct {
	int kind;
	double timestamp;
	int phase;
	double a;
	double b;
} Signal;

static napi_threadsafe_function listener = NULL;
static IMP originalDeltaY = NULL;
static IMP originalSendEvent = NULL;

static NSTimeInterval lastTimestamp = -1;
static NSEventPhase lastPhase = NSEventPhaseNone;
static NSEventPhase lastMomentumPhase = NSEventPhaseNone;
static NSEventPhase lastFingerPhase = NSEventPhaseNone;
static NSTimeInterval lastMove = 0;
static double momentumLast = 0;

static void callJs(napi_env env, napi_value js, void *context, void *data) {
	Signal *signal = data;
	if (env != NULL && js != NULL) {
		napi_value args[5];
		napi_value undefined;
		napi_create_int32(env, signal->kind, &args[0]);
		napi_create_double(env, signal->timestamp, &args[1]);
		napi_create_int32(env, signal->phase, &args[2]);
		napi_create_double(env, signal->a, &args[3]);
		napi_create_double(env, signal->b, &args[4]);
		napi_get_undefined(env, &undefined);
		napi_call_function(env, undefined, js, 5, args, NULL);
	}
	free(signal);
}

static void emit(int kind, NSTimeInterval timestamp, NSEventPhase phase, double a, double b) {
	if (listener == NULL) return;
	Signal *signal = malloc(sizeof(Signal));
	if (signal == NULL) return;
	*signal = (Signal){kind, timestamp, (int)phase, a, b};
	if (napi_call_threadsafe_function(listener, signal, napi_tsfn_nonblocking) != napi_ok) free(signal);
}

static void report(NSEvent *event) {
	if (event.type != NSEventTypeScrollWheel) return;
	NSEventPhase phase = event.phase;
	NSEventPhase momentum = event.momentumPhase;
	NSTimeInterval timestamp = event.timestamp;
	if (timestamp == lastTimestamp && phase == lastPhase && momentum == lastMomentumPhase) return;
	lastTimestamp = timestamp;
	lastPhase = phase;
	lastMomentumPhase = momentum;
	double size = fabs(event.scrollingDeltaX) + fabs(event.scrollingDeltaY);

	if (phase == NSEventPhaseMayBegin || (phase == NSEventPhaseBegan && lastFingerPhase != NSEventPhaseMayBegin)) {
		lastMove = 0;
		emit(SIGNAL_DOWN, timestamp, phase, 0, 0);
	}
	if ((phase == NSEventPhaseBegan || phase == NSEventPhaseChanged) && size > 0) lastMove = timestamp;
	if (phase == NSEventPhaseEnded || phase == NSEventPhaseCancelled) emit(SIGNAL_UP, timestamp, phase, lastMove, 0);
	if (phase != NSEventPhaseNone) lastFingerPhase = phase;

	if (momentum == NSEventPhaseBegan) {
		momentumLast = 0;
		emit(SIGNAL_MOMENTUM_BEGAN, timestamp, momentum, 0, 0);
	}
	if ((momentum == NSEventPhaseBegan || momentum == NSEventPhaseChanged) && size > 0) {
		momentumLast = size;
	}
	if (momentum == NSEventPhaseEnded || momentum == NSEventPhaseCancelled) emit(SIGNAL_MOMENTUM_ENDED, timestamp, momentum, momentumLast, 0);
}

static CGFloat deltaYReporting(id self, SEL command) {
	report(self);
	return ((CGFloat(*)(id, SEL))originalDeltaY)(self, command);
}

static void sendEventReporting(id self, SEL command, NSEvent *event) {
	report(event);
	((void (*)(id, SEL, NSEvent *))originalSendEvent)(self, command, event);
}

static Hook install(void) {
	Class event = [NSEvent class];
	Class window = [NSWindow class];
	if (class_respondsToSelector(object_getClass(event), sel_registerName("taskCalendarTrackpadInstalled"))) return HOOK_REFUSED;
	Method deltaY = class_getInstanceMethod(event, @selector(deltaY));
	Method sendEvent = class_getInstanceMethod(window, @selector(sendEvent:));
	if (deltaY == NULL || sendEvent == NULL) return HOOK_REFUSED;
	SEL keptDeltaY = sel_registerName("taskCalendarTrackpadOriginalDeltaY");
	SEL keptSendEvent = sel_registerName("taskCalendarTrackpadOriginalSendEvent:");
	SEL ownDeltaY = sel_registerName("taskCalendarTrackpadHookDeltaY");
	SEL ownSendEvent = sel_registerName("taskCalendarTrackpadHookSendEvent:");
	BOOL fresh = class_addMethod(event, keptDeltaY, method_getImplementation(deltaY), method_getTypeEncoding(deltaY));
	if (fresh) {
		class_addMethod(event, ownDeltaY, method_getImplementation(deltaY), method_getTypeEncoding(deltaY));
		class_addMethod(window, keptSendEvent, method_getImplementation(sendEvent), method_getTypeEncoding(sendEvent));
		class_addMethod(window, ownSendEvent, method_getImplementation(sendEvent), method_getTypeEncoding(sendEvent));
	}
	Method hookedDeltaY = class_getInstanceMethod(event, ownDeltaY);
	Method hookedSendEvent = class_getInstanceMethod(window, ownSendEvent);
	Method originalDeltaYMethod = class_getInstanceMethod(event, keptDeltaY);
	Method originalSendEventMethod = class_getInstanceMethod(window, keptSendEvent);
	if (hookedDeltaY == NULL || hookedSendEvent == NULL || originalDeltaYMethod == NULL || originalSendEventMethod == NULL) return HOOK_REFUSED;
	if (method_getImplementation(deltaY) != method_getImplementation(hookedDeltaY)) return HOOK_REFUSED;
	if (method_getImplementation(sendEvent) != method_getImplementation(hookedSendEvent)) return HOOK_REFUSED;
	originalDeltaY = method_getImplementation(originalDeltaYMethod);
	originalSendEvent = method_getImplementation(originalSendEventMethod);
	method_setImplementation(hookedDeltaY, (IMP)deltaYReporting);
	method_setImplementation(hookedSendEvent, (IMP)sendEventReporting);
	method_setImplementation(deltaY, (IMP)deltaYReporting);
	method_setImplementation(sendEvent, (IMP)sendEventReporting);
	return fresh ? HOOK_FRESH : HOOK_TOOK_OVER;
}

static void stopListening(void) {
	if (listener == NULL) return;
	napi_threadsafe_function old = listener;
	listener = NULL;
	napi_release_threadsafe_function(old, napi_tsfn_release);
}

static napi_value startListening(napi_env env, napi_callback_info info) {
	size_t argc = 1;
	napi_value args[1];
	napi_value name;
	napi_get_cb_info(env, info, &argc, args, NULL, NULL);
	if (argc < 1) return NULL;
	stopListening();
	napi_create_string_utf8(env, "task-calendar-trackpad", NAPI_AUTO_LENGTH, &name);
	napi_threadsafe_function created = NULL;
	if (napi_create_threadsafe_function(env, args[0], NULL, name, 0, 1, NULL, NULL, NULL, callJs, &created) != napi_ok) return NULL;
	napi_unref_threadsafe_function(env, created);
	listener = created;
	return NULL;
}

static napi_value stopCall(napi_env env, napi_callback_info info) {
	stopListening();
	return NULL;
}

static napi_value uptime(napi_env env, napi_callback_info info) {
	napi_value result;
	napi_create_double(env, [[NSProcessInfo processInfo] systemUptime], &result);
	return result;
}

static napi_value take(napi_env env, napi_callback_info info) {
	napi_value result;
	napi_create_string_utf8(env, HOOK_NAMES[install()], NAPI_AUTO_LENGTH, &result);
	return result;
}

static napi_value init(napi_env env, napi_value exports) {
	napi_value value;
	napi_create_function(env, "take", NAPI_AUTO_LENGTH, take, NULL, &value);
	napi_set_named_property(env, exports, "take", value);
	napi_create_function(env, "listen", NAPI_AUTO_LENGTH, startListening, NULL, &value);
	napi_set_named_property(env, exports, "listen", value);
	napi_create_function(env, "stop", NAPI_AUTO_LENGTH, stopCall, NULL, &value);
	napi_set_named_property(env, exports, "stop", value);
	napi_create_function(env, "uptime", NAPI_AUTO_LENGTH, uptime, NULL, &value);
	napi_set_named_property(env, exports, "uptime", value);
	napi_create_string_utf8(env, TRACKPAD_BUILD, NAPI_AUTO_LENGTH, &value);
	napi_set_named_property(env, exports, "build", value);
	return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
