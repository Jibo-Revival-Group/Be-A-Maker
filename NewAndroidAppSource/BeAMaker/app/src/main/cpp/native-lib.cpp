#include <jni.h>
#include <string>
#include <cstdlib>
#include <cstring>
#include <pthread.h>
#include <unistd.h>
#include <android/log.h>
#include "node.h"

static const char *ADBTAG = "BEAMAKER-NODE";

// --- Redirect Node's stdout/stderr to logcat, so console.log/error show up
//     when you view the app in Android Studio's Logcat panel. ---
static int pipe_stdout[2];
static int pipe_stderr[2];
static pthread_t thread_stdout;
static pthread_t thread_stderr;

static void *thread_stdout_func(void *) {
    ssize_t n;
    char buf[2048];
    while ((n = read(pipe_stdout[0], buf, sizeof buf - 1)) > 0) {
        if (buf[n - 1] == '\n') --n;
        buf[n] = 0;
        __android_log_write(ANDROID_LOG_INFO, ADBTAG, buf);
    }
    return nullptr;
}

static void *thread_stderr_func(void *) {
    ssize_t n;
    char buf[2048];
    while ((n = read(pipe_stderr[0], buf, sizeof buf - 1)) > 0) {
        if (buf[n - 1] == '\n') --n;
        buf[n] = 0;
        __android_log_write(ANDROID_LOG_ERROR, ADBTAG, buf);
    }
    return nullptr;
}

static int start_redirecting_stdout_stderr() {
    setvbuf(stdout, nullptr, _IONBF, 0);
    pipe(pipe_stdout);
    dup2(pipe_stdout[1], STDOUT_FILENO);

    setvbuf(stderr, nullptr, _IONBF, 0);
    pipe(pipe_stderr);
    dup2(pipe_stderr[1], STDERR_FILENO);

    if (pthread_create(&thread_stdout, nullptr, thread_stdout_func, nullptr) == -1) return -1;
    pthread_detach(thread_stdout);
    if (pthread_create(&thread_stderr, nullptr, thread_stderr_func, nullptr) == -1) return -1;
    pthread_detach(thread_stderr);
    return 0;
}

// node's libuv requires all argv strings on contiguous memory.
extern "C" JNIEXPORT jint JNICALL
Java_com_beamaker_app_MainActivity_startNodeWithArguments(
        JNIEnv *env,
        jobject /* this */,
        jobjectArray arguments) {

    if (start_redirecting_stdout_stderr() == -1) {
        __android_log_write(ANDROID_LOG_ERROR, ADBTAG, "Could not redirect stdout/stderr to logcat.");
    }

    jsize argument_count = env->GetArrayLength(arguments);

    int c_arguments_size = 0;
    for (int i = 0; i < argument_count; i++) {
        auto jstr = (jstring) env->GetObjectArrayElement(arguments, i);
        const char *s = env->GetStringUTFChars(jstr, nullptr);
        c_arguments_size += (int) strlen(s) + 1;
        env->ReleaseStringUTFChars(jstr, s);
    }

    char *args_buffer = (char *) calloc(c_arguments_size, sizeof(char));
    char **argv = (char **) calloc(argument_count, sizeof(char *));
    char *current = args_buffer;

    for (int i = 0; i < argument_count; i++) {
        auto jstr = (jstring) env->GetObjectArrayElement(arguments, i);
        const char *s = env->GetStringUTFChars(jstr, nullptr);
        size_t len = strlen(s);
        strncpy(current, s, len);
        argv[i] = current;
        current += len + 1;
        env->ReleaseStringUTFChars(jstr, s);
    }

    jint result = jint(node::Start(argument_count, argv));

    free(argv);
    free(args_buffer);
    return result;
}
